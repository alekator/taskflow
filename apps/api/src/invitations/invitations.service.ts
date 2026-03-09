import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  WorkspaceInvitationStatus,
  WorkspaceMemberRole,
} from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { AsyncJobsService } from '../async-jobs/async-jobs.service';
import { AuditService } from '../audit/audit.service';
import { toPaginatedResult } from '../common/pagination';
import { WorkspaceAccessService } from '../common/workspace-access.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWorkspaceInvitationDto } from './dto/create-workspace-invitation.dto';
import { ListWorkspaceInvitationsQueryDto } from './dto/list-workspace-invitations-query.dto';

type InvitationForRegistration = {
  id: string;
  workspaceId: string;
  role: WorkspaceMemberRole;
};

@Injectable()
export class InvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceAccess: WorkspaceAccessService,
    private readonly audit: AuditService,
    private readonly asyncJobs: AsyncJobsService,
  ) {}

  private requireAdminWorkspaceRole(role: WorkspaceMemberRole) {
    if (role !== WorkspaceMemberRole.ADMIN) {
      throw new ForbiddenException(
        'Only workspace admins can manage invitations',
      );
    }
  }

  private tokenHash(raw: string) {
    return createHash('sha256').update(raw).digest('hex');
  }

  private buildInviteLink(token: string) {
    const baseUrl =
      process.env.INVITE_BASE_URL?.trim() || 'http://localhost:3002';
    return `${baseUrl.replace(/\/+$/, '')}/auth/register?invite=${encodeURIComponent(token)}`;
  }

  async create(requesterId: string, dto: CreateWorkspaceInvitationDto) {
    const access = await this.workspaceAccess.getRequiredWorkspace(requesterId);
    this.requireAdminWorkspaceRole(access.memberRole);

    const email = dto.email.trim().toLowerCase();
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existingUser) {
      const member = await this.prisma.workspaceMember.findUnique({
        where: {
          workspaceId_userId: {
            workspaceId: access.workspaceId,
            userId: existingUser.id,
          },
        },
        select: { userId: true },
      });
      if (member) {
        throw new ConflictException('User already belongs to this workspace');
      }
    }

    const activeInvite = await this.prisma.workspaceInvitation.findFirst({
      where: {
        workspaceId: access.workspaceId,
        email,
        status: WorkspaceInvitationStatus.PENDING,
        expiresAt: { gt: new Date() },
      },
      select: { id: true },
    });
    if (activeInvite) {
      throw new ConflictException(
        'Active invitation already exists for this email',
      );
    }

    const rawToken = randomBytes(24).toString('base64url');
    const tokenHash = this.tokenHash(rawToken);
    const expiresInDays = dto.expiresInDays ?? 7;
    const expiresAt = new Date(
      Date.now() + expiresInDays * 24 * 60 * 60 * 1000,
    );

    const inviteLink = this.buildInviteLink(rawToken);

    const invite = await this.prisma.workspaceInvitation.create({
      data: {
        workspaceId: access.workspaceId,
        email,
        role: dto.role ?? WorkspaceMemberRole.MEMBER,
        invitedByUserId: requesterId,
        tokenHash,
        expiresAt,
      },
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        expiresAt: true,
        createdAt: true,
      },
    });

    await this.asyncJobs.enqueue({
      type: 'SEND_WORKSPACE_INVITE_EMAIL',
      dedupeKey: `invite-email:${invite.id}`,
      payload: {
        invitationId: invite.id,
        workspaceId: access.workspaceId,
        email: invite.email,
        inviteLink,
        requestedByUserId: requesterId,
      },
      maxAttempts: 6,
    });

    await this.audit.log({
      action: 'WORKSPACE_INVITATION_CREATE',
      actorUserId: requesterId,
      entityType: 'workspace_invitation',
      entityId: invite.id,
      payload: {
        email: invite.email,
        role: invite.role,
        workspaceId: access.workspaceId,
        expiresAt: invite.expiresAt.toISOString(),
      },
    });

    return {
      ...invite,
      inviteToken: rawToken,
      inviteLink,
    };
  }

  async list(requesterId: string, query: ListWorkspaceInvitationsQueryDto) {
    const access = await this.workspaceAccess.getRequiredWorkspace(requesterId);
    this.requireAdminWorkspaceRole(access.memberRole);

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.WorkspaceInvitationWhereInput = {
      workspaceId: access.workspaceId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.email
        ? { email: { contains: query.email.trim().toLowerCase() } }
        : {}),
    };

    const [total, items] = await this.prisma.$transaction([
      this.prisma.workspaceInvitation.count({ where }),
      this.prisma.workspaceInvitation.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          email: true,
          role: true,
          status: true,
          invitedByUserId: true,
          expiresAt: true,
          acceptedAt: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    ]);

    return toPaginatedResult(items, page, limit, total);
  }

  async revoke(requesterId: string, invitationId: string) {
    const access = await this.workspaceAccess.getRequiredWorkspace(requesterId);
    this.requireAdminWorkspaceRole(access.memberRole);

    const updated = await this.prisma.workspaceInvitation.updateMany({
      where: {
        id: invitationId,
        workspaceId: access.workspaceId,
        status: WorkspaceInvitationStatus.PENDING,
      },
      data: {
        status: WorkspaceInvitationStatus.REVOKED,
      },
    });

    if (updated.count !== 1) {
      throw new NotFoundException('Active invitation not found');
    }

    await this.audit.log({
      action: 'WORKSPACE_INVITATION_REVOKE',
      actorUserId: requesterId,
      entityType: 'workspace_invitation',
      entityId: invitationId,
      payload: { workspaceId: access.workspaceId },
    });

    return { ok: true };
  }

  async consumeForRegistration(
    email: string,
    inviteToken?: string,
  ): Promise<InvitationForRegistration | null> {
    if (!inviteToken) return null;

    const tokenHash = this.tokenHash(inviteToken.trim());
    const invitation = await this.prisma.workspaceInvitation.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        workspaceId: true,
        email: true,
        role: true,
        status: true,
        expiresAt: true,
      },
    });

    if (!invitation) {
      throw new ForbiddenException('Invalid invitation token');
    }

    if (invitation.status !== WorkspaceInvitationStatus.PENDING) {
      throw new ForbiddenException('Invitation is no longer active');
    }

    if (invitation.expiresAt <= new Date()) {
      await this.prisma.workspaceInvitation.updateMany({
        where: {
          id: invitation.id,
          status: WorkspaceInvitationStatus.PENDING,
        },
        data: { status: WorkspaceInvitationStatus.EXPIRED },
      });
      throw new ForbiddenException('Invitation has expired');
    }

    if (invitation.email !== email) {
      throw new ForbiddenException('Invitation does not match this email');
    }

    return {
      id: invitation.id,
      workspaceId: invitation.workspaceId,
      role: invitation.role,
    };
  }

  async accept(invitationId: string, actorUserId: string) {
    await this.prisma.workspaceInvitation.updateMany({
      where: {
        id: invitationId,
        status: WorkspaceInvitationStatus.PENDING,
      },
      data: {
        status: WorkspaceInvitationStatus.ACCEPTED,
        acceptedAt: new Date(),
      },
    });

    await this.audit.log({
      action: 'WORKSPACE_INVITATION_ACCEPT',
      actorUserId,
      entityType: 'workspace_invitation',
      entityId: invitationId,
    });
  }
}
