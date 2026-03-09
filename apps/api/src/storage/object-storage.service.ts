import { Injectable } from '@nestjs/common';

export type UploadTarget = {
  provider: string;
  objectKey: string;
  uploadUrl: string;
  uploadMethod: 'PUT';
  headers: Record<string, string>;
  expiresAt: string;
};

@Injectable()
export class ObjectStorageService {
  private readonly provider = 'LOCAL';

  private sanitizeFileName(name: string) {
    return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
  }

  createUploadTarget(input: {
    workspaceId: string;
    taskId: string;
    attachmentId: string;
    fileName: string;
    uploadToken: string;
  }): UploadTarget {
    const safeName = this.sanitizeFileName(input.fileName);
    const objectKey = `${input.workspaceId}/${input.taskId}/${input.attachmentId}_${safeName}`;
    const uploadUrl = `/api/tasks/${input.taskId}/attachments/${input.attachmentId}/content?token=${encodeURIComponent(input.uploadToken)}`;
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    return {
      provider: this.provider,
      objectKey,
      uploadUrl,
      uploadMethod: 'PUT',
      headers: {
        'x-taskflow-upload-token': input.uploadToken,
      },
      expiresAt,
    };
  }

  createProjectUploadTarget(input: {
    workspaceId: string;
    projectId: string;
    attachmentId: string;
    fileName: string;
    uploadToken: string;
  }): UploadTarget {
    const safeName = this.sanitizeFileName(input.fileName);
    const objectKey = `${input.workspaceId}/${input.projectId}/${input.attachmentId}_${safeName}`;
    const uploadUrl = `/api/projects/${input.projectId}/attachments/${input.attachmentId}/content?token=${encodeURIComponent(input.uploadToken)}`;
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    return {
      provider: this.provider,
      objectKey,
      uploadUrl,
      uploadMethod: 'PUT',
      headers: {
        'x-taskflow-upload-token': input.uploadToken,
      },
      expiresAt,
    };
  }

  getDownloadUrl(taskId: string, attachmentId: string) {
    return `/api/tasks/${taskId}/attachments/${attachmentId}/download`;
  }

  getProjectDownloadUrl(projectId: string, attachmentId: string) {
    return `/api/projects/${projectId}/attachments/${attachmentId}/download`;
  }
}
