import { ForbiddenException, Injectable } from '@nestjs/common';
import { WorkspaceMemberRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type WorkspaceAccess = {
  workspaceId: string;
  memberRole: WorkspaceMemberRole;
};

@Injectable()
export class WorkspaceAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async getRequiredWorkspace(userId: string): Promise<WorkspaceAccess> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        defaultWorkspaceId: true,
      },
    });

    if (!user) {
      throw new ForbiddenException('User has no workspace access');
    }

    if (user.defaultWorkspaceId) {
      const member = await this.prisma.workspaceMember.findUnique({
        where: {
          workspaceId_userId: {
            workspaceId: user.defaultWorkspaceId,
            userId,
          },
        },
        select: { role: true },
      });

      if (member) {
        return {
          workspaceId: user.defaultWorkspaceId,
          memberRole: member.role,
        };
      }
    }

    const fallbackMembership = await this.prisma.workspaceMember.findFirst({
      where: { userId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        workspaceId: true,
        role: true,
      },
    });

    if (!fallbackMembership) {
      throw new ForbiddenException('User has no workspace access');
    }

    await this.prisma.user.updateMany({
      where: { id: userId, defaultWorkspaceId: null },
      data: { defaultWorkspaceId: fallbackMembership.workspaceId },
    });

    return {
      workspaceId: fallbackMembership.workspaceId,
      memberRole: fallbackMembership.role,
    };
  }
}
