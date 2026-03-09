import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AttachmentStatus, ProjectRole, UserRole } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { AuditService } from '../audit/audit.service';
import { WorkspaceAccessService } from '../common/workspace-access.service';
import { PrismaService } from '../prisma/prisma.service';
import { ObjectStorageService } from '../storage/object-storage.service';
import { CompleteTaskAttachmentUploadDto } from './dto/complete-task-attachment-upload.dto';
import { CreateTaskAttachmentUploadDto } from './dto/create-task-attachment-upload.dto';

type TaskAccessContext = {
  workspaceId: string;
  task: {
    id: string;
    projectId: string;
    project: { id: string; ownerId: string };
  };
  canManageAttachments: boolean;
};

@Injectable()
export class AttachmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceAccess: WorkspaceAccessService,
    private readonly storage: ObjectStorageService,
    private readonly audit: AuditService,
  ) {}

  private getAllowedMimeTypes() {
    const raw =
      process.env.ATTACHMENTS_ALLOWED_MIME ??
      'image/png,image/jpeg,image/webp,application/pdf,text/plain';
    return raw
      .split(',')
      .map((v) => v.trim().toLowerCase())
      .filter((v) => v.length > 0);
  }

  private validateUploadInput(dto: CreateTaskAttachmentUploadDto) {
    const fileName = dto.fileName.trim();
    if (fileName.includes('/') || fileName.includes('\\')) {
      throw new BadRequestException('Invalid attachment file name');
    }
    if (/[\x00-\x1F]/.test(fileName)) {
      throw new BadRequestException('Invalid attachment file name');
    }

    const mimeType = dto.mimeType.trim().toLowerCase();
    const allowed = this.getAllowedMimeTypes();
    if (!allowed.includes(mimeType)) {
      throw new BadRequestException('Attachment mime type is not allowed');
    }
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private async getTaskAccess(
    userId: string,
    userRole: string,
    taskId: string,
  ): Promise<TaskAccessContext> {
    const { workspaceId } = await this.workspaceAccess.getRequiredWorkspace(
      userId,
    );

    const where =
      userRole === UserRole.ADMIN
        ? {
            id: taskId,
            project: { workspaceId },
          }
        : {
            id: taskId,
            project: {
              workspaceId,
              OR: [{ ownerId: userId }, { members: { some: { userId } } }],
            },
          };

    const task = await this.prisma.task.findFirst({
      where,
      select: {
        id: true,
        projectId: true,
        project: {
          select: {
            id: true,
            ownerId: true,
          },
        },
      },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    let canManageAttachments = userRole === UserRole.ADMIN;
    if (!canManageAttachments && task.project.ownerId === userId) {
      canManageAttachments = true;
    }

    if (!canManageAttachments) {
      const member = await this.prisma.projectMember.findUnique({
        where: {
          projectId_userId: {
            projectId: task.projectId,
            userId,
          },
        },
        select: { role: true },
      });

      canManageAttachments =
        member?.role === ProjectRole.OWNER || member?.role === ProjectRole.MANAGER;
    }

    return { workspaceId, task, canManageAttachments };
  }

  async createUpload(
    userId: string,
    userRole: string,
    taskId: string,
    dto: CreateTaskAttachmentUploadDto,
  ) {
    this.validateUploadInput(dto);
    const access = await this.getTaskAccess(userId, userRole, taskId);

    const uploadToken = randomBytes(24).toString('base64url');
    const attachment = await this.prisma.taskAttachment.create({
      data: {
        taskId: access.task.id,
        uploadedByUserId: userId,
        fileName: dto.fileName.trim(),
        mimeType: dto.mimeType.trim().toLowerCase(),
        sizeBytes: dto.sizeBytes,
        storageProvider: 'LOCAL',
        objectKey: `${access.workspaceId}/${access.task.id}/pending_${Date.now()}_${randomBytes(6).toString('hex')}`,
        status: AttachmentStatus.PENDING,
        uploadTokenHash: this.hashToken(uploadToken),
      },
      select: {
        id: true,
        taskId: true,
        fileName: true,
        mimeType: true,
        sizeBytes: true,
        storageProvider: true,
      },
    });

    const target = this.storage.createUploadTarget({
      workspaceId: access.workspaceId,
      taskId: access.task.id,
      attachmentId: attachment.id,
      fileName: attachment.fileName,
      uploadToken,
    });

    await this.prisma.taskAttachment.update({
      where: { id: attachment.id },
      data: {
        objectKey: target.objectKey,
      },
    });

    await this.audit.log({
      action: 'TASK_ATTACHMENT_UPLOAD_CREATE',
      actorUserId: userId,
      entityType: 'task_attachment',
      entityId: attachment.id,
      projectId: access.task.projectId,
      payload: {
        taskId: access.task.id,
        fileName: attachment.fileName,
        sizeBytes: attachment.sizeBytes,
      },
    });

    return {
      attachment: {
        ...attachment,
        objectKey: target.objectKey,
        status: AttachmentStatus.PENDING,
      },
      upload: target,
      uploadToken,
    };
  }

  async completeUpload(
    userId: string,
    userRole: string,
    taskId: string,
    attachmentId: string,
    dto: CompleteTaskAttachmentUploadDto,
  ) {
    const access = await this.getTaskAccess(userId, userRole, taskId);
    const attachment = await this.prisma.taskAttachment.findFirst({
      where: {
        id: attachmentId,
        taskId: access.task.id,
      },
    });

    if (!attachment || attachment.status === AttachmentStatus.DELETED) {
      throw new NotFoundException('Attachment not found');
    }

    if (attachment.status === AttachmentStatus.AVAILABLE) {
      throw new ConflictException('Attachment is already completed');
    }

    if (!attachment.uploadTokenHash) {
      throw new ForbiddenException('Attachment upload token is invalid');
    }

    if (attachment.uploadTokenHash !== this.hashToken(dto.uploadToken.trim())) {
      throw new ForbiddenException('Attachment upload token is invalid');
    }

    const updated = await this.prisma.taskAttachment.update({
      where: { id: attachment.id },
      data: {
        status: AttachmentStatus.AVAILABLE,
        uploadedAt: new Date(),
        uploadTokenHash: null,
      },
      select: {
        id: true,
        taskId: true,
        fileName: true,
        mimeType: true,
        sizeBytes: true,
        storageProvider: true,
        objectKey: true,
        status: true,
        uploadedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    await this.audit.log({
      action: 'TASK_ATTACHMENT_UPLOAD_COMPLETE',
      actorUserId: userId,
      entityType: 'task_attachment',
      entityId: attachment.id,
      projectId: access.task.projectId,
      payload: {
        taskId: access.task.id,
      },
    });

    return {
      ...updated,
      downloadUrl: this.storage.getDownloadUrl(taskId, attachment.id),
    };
  }

  async list(userId: string, userRole: string, taskId: string) {
    await this.getTaskAccess(userId, userRole, taskId);

    const items = await this.prisma.taskAttachment.findMany({
      where: {
        taskId,
        status: { not: AttachmentStatus.DELETED },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        fileName: true,
        mimeType: true,
        sizeBytes: true,
        storageProvider: true,
        status: true,
        uploadedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return items.map((item) => ({
      ...item,
      downloadUrl: this.storage.getDownloadUrl(taskId, item.id),
    }));
  }

  async remove(
    userId: string,
    userRole: string,
    taskId: string,
    attachmentId: string,
  ) {
    const access = await this.getTaskAccess(userId, userRole, taskId);
    const attachment = await this.prisma.taskAttachment.findFirst({
      where: {
        id: attachmentId,
        taskId: access.task.id,
        status: { not: AttachmentStatus.DELETED },
      },
      select: {
        id: true,
        uploadedByUserId: true,
      },
    });

    if (!attachment) {
      throw new NotFoundException('Attachment not found');
    }

    const canDelete =
      access.canManageAttachments || attachment.uploadedByUserId === userId;
    if (!canDelete) {
      throw new ForbiddenException();
    }

    await this.prisma.taskAttachment.update({
      where: { id: attachment.id },
      data: {
        status: AttachmentStatus.DELETED,
        deletedAt: new Date(),
      },
    });

    await this.audit.log({
      action: 'TASK_ATTACHMENT_DELETE',
      actorUserId: userId,
      entityType: 'task_attachment',
      entityId: attachment.id,
      projectId: access.task.projectId,
      payload: { taskId },
    });

    return { ok: true };
  }
}
