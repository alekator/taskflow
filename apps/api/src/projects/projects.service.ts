import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  PreconditionFailedException,
} from '@nestjs/common';
import { Prisma, ProjectRole } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { requireIfMatchVersion } from '../common/if-match';
import { toPaginatedResult } from '../common/pagination';
import { WorkspaceAccessService } from '../common/workspace-access.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { AddMemberDto } from './dto/add-member.dto';
import { CreateProjectDto } from './dto/create-project.dto';
import { ListMembersQueryDto } from './dto/list-members-query.dto';
import { ListProjectsQueryDto } from './dto/list-projects-query.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';
import { UpdateProjectDto } from './dto/update-project.dto';

@Injectable()
export class ProjectsService {
  constructor(
    private prisma: PrismaService,
    private realtime: RealtimeService,
    private audit: AuditService,
    private workspaceAccess: WorkspaceAccessService,
  ) {}

  private async getProject(workspaceId: string, projectId: string) {
    return this.prisma.project.findFirst({
      where: { id: projectId, workspaceId },
      select: { id: true, ownerId: true },
    });
  }

  private async requireRole(userId: string, workspaceId: string, projectId: string) {
    const project = await this.getProject(workspaceId, projectId);
    if (!project) throw new NotFoundException('Project not found');

    // Owners are treated as an implicit membership so permission checks do not
    // depend on the join table staying in sync with ownership.
    if (project.ownerId === userId) return ProjectRole.OWNER;

    const member = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
      select: { role: true },
    });

    if (!member) throw new ForbiddenException();
    return member.role;
  }

  async create(userId: string, dto: CreateProjectDto) {
    const { workspaceId } = await this.workspaceAccess.getRequiredWorkspace(
      userId,
    );

    const project = await this.prisma.project.create({
      data: {
        name: dto.name,
        description: dto.description,
        ownerId: userId,
        workspaceId,
        members: {
          create: {
            userId,
            role: ProjectRole.OWNER,
          },
        },
      },
    });

    this.realtime.emitProjectEvent(project.id, 'project.created', {
      projectId: project.id,
      actorUserId: userId,
      name: project.name,
    });

    await this.audit.log({
      action: 'PROJECT_CREATE',
      actorUserId: userId,
      entityType: 'project',
      entityId: project.id,
      projectId: project.id,
      payload: { name: project.name },
    });

    return project;
  }

  async findMy(userId: string, userRole: string, query: ListProjectsQueryDto) {
    const { workspaceId } = await this.workspaceAccess.getRequiredWorkspace(
      userId,
    );
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    // Project listing is always constrained to the active workspace first.
    const accessWhere: Prisma.ProjectWhereInput =
      userRole === 'ADMIN'
        ? { workspaceId }
        : {
            workspaceId,
            OR: [{ ownerId: userId }, { members: { some: { userId } } }],
          };

    const where: Prisma.ProjectWhereInput = query.search
      ? {
          AND: [
            accessWhere,
            {
              OR: [
                { name: { contains: query.search, mode: 'insensitive' } },
                {
                  description: {
                    contains: query.search,
                    mode: 'insensitive',
                  },
                },
              ],
            },
          ],
        }
      : accessWhere;

    const orderBy: Prisma.ProjectOrderByWithRelationInput = {
      [query.sortBy ?? 'createdAt']: query.sortOrder ?? 'desc',
    };

    const [total, items] = await this.prisma.$transaction([
      this.prisma.project.count({ where }),
      this.prisma.project.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return toPaginatedResult(items, page, limit, total);
  }

  async findOne(userId: string, projectId: string) {
    const { workspaceId } = await this.workspaceAccess.getRequiredWorkspace(
      userId,
    );
    await this.requireRole(userId, workspaceId, projectId);

    const project = await this.prisma.project.findFirst({
      where: { id: projectId, workspaceId },
    });
    if (!project) throw new NotFoundException('Project not found');

    return project;
  }

  async update(
    userId: string,
    projectId: string,
    ifMatchHeader: string | undefined,
    dto: UpdateProjectDto,
  ) {
    const { workspaceId } = await this.workspaceAccess.getRequiredWorkspace(
      userId,
    );
    const role = await this.requireRole(userId, workspaceId, projectId);
    if (!role) throw new NotFoundException('Project not found');
    if (role !== ProjectRole.OWNER && role !== ProjectRole.MANAGER) {
      throw new ForbiddenException();
    }

    // Use updateMany with the expected version to keep the write atomic. This
    // closes the race between "read current version" and "write changes".
    const expectedVersion = requireIfMatchVersion(ifMatchHeader);
    const result = await this.prisma.project.updateMany({
      where: { id: projectId, workspaceId, version: expectedVersion },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description }
          : {}),
        version: { increment: 1 },
      },
    });

    if (result.count !== 1) {
      throw new PreconditionFailedException('Version mismatch');
    }

    const updated = await this.prisma.project.findFirst({
      where: { id: projectId, workspaceId },
    });
    if (!updated) throw new NotFoundException('Project not found');

    await this.audit.log({
      action: 'PROJECT_UPDATE',
      actorUserId: userId,
      entityType: 'project',
      entityId: projectId,
      projectId,
      payload: {
        previousVersion: expectedVersion,
        currentVersion: updated.version,
      },
    });

    return updated;
  }

  async remove(userId: string, projectId: string, ifMatchHeader?: string) {
    const { workspaceId } = await this.workspaceAccess.getRequiredWorkspace(
      userId,
    );
    const role = await this.requireRole(userId, workspaceId, projectId);
    if (!role) throw new NotFoundException('Project not found');
    if (role !== ProjectRole.OWNER && role !== ProjectRole.MANAGER) {
      throw new ForbiddenException();
    }

    const expectedVersion = requireIfMatchVersion(ifMatchHeader);
    const removed = await this.prisma.project.deleteMany({
      where: { id: projectId, workspaceId, version: expectedVersion },
    });

    if (removed.count !== 1) {
      throw new PreconditionFailedException('Version mismatch');
    }

    await this.audit.log({
      action: 'PROJECT_DELETE',
      actorUserId: userId,
      entityType: 'project',
      entityId: projectId,
      projectId,
      payload: { previousVersion: expectedVersion },
    });

    return { ok: true };
  }

  async listMembers(
    requesterId: string,
    projectId: string,
    query: ListMembersQueryDto,
  ) {
    const { workspaceId } =
      await this.workspaceAccess.getRequiredWorkspace(requesterId);
    await this.requireRole(requesterId, workspaceId, projectId);

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where: Prisma.ProjectMemberWhereInput = {
      projectId,
      ...(query.role ? { role: query.role } : {}),
      ...(query.search
        ? {
            user: {
              OR: [
                { email: { contains: query.search, mode: 'insensitive' } },
                { name: { contains: query.search, mode: 'insensitive' } },
              ],
            },
          }
        : {}),
    };

    const sortBy = query.sortBy ?? 'createdAt';
    const sortOrder = query.sortOrder ?? 'asc';

    const orderBy: Prisma.ProjectMemberOrderByWithRelationInput[] =
      sortBy === 'createdAt'
        ? [{ createdAt: sortOrder }]
        : [{ role: sortOrder }, { createdAt: 'asc' }];

    const [total, items] = await this.prisma.$transaction([
      this.prisma.projectMember.count({ where }),
      this.prisma.projectMember.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        select: {
          userId: true,
          role: true,
          createdAt: true,
          user: { select: { id: true, email: true, name: true, role: true } },
        },
      }),
    ]);

    return toPaginatedResult(items, page, limit, total);
  }

  async addMember(requesterId: string, projectId: string, dto: AddMemberDto) {
    const { workspaceId } =
      await this.workspaceAccess.getRequiredWorkspace(requesterId);
    const requesterRole = await this.requireRole(
      requesterId,
      workspaceId,
      projectId,
    );

    if (
      requesterRole !== ProjectRole.OWNER &&
      requesterRole !== ProjectRole.MANAGER
    ) {
      throw new ForbiddenException();
    }

    const project = await this.getProject(workspaceId, projectId);
    if (!project) throw new NotFoundException('Project not found');

    const roleToSet = dto.role ?? ProjectRole.MEMBER;
    // Managers can expand execution capacity, but only owners can change the
    // project's privilege structure.
    if (
      requesterRole === ProjectRole.MANAGER &&
      roleToSet !== ProjectRole.MEMBER
    ) {
      throw new ForbiddenException();
    }

    if (dto.userId === project.ownerId) {
      throw new ConflictException('Owner is already in project');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: dto.userId },
      select: { id: true, role: true, defaultWorkspaceId: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const existingMembership = await this.prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId: dto.userId,
        },
      },
      select: { workspaceId: true },
    });

    if (!existingMembership) {
      // Backward compatibility for legacy users created before workspaces were
      // introduced: if they are not attached to any workspace yet, attach them
      // to the current workspace on first explicit collaboration action.
      if (user.defaultWorkspaceId) {
        throw new ForbiddenException('User is not in workspace');
      }

      await this.prisma.$transaction([
        this.prisma.workspaceMember.create({
          data: {
            workspaceId,
            userId: user.id,
            role: user.role === 'ADMIN' ? 'ADMIN' : 'MEMBER',
          },
        }),
        this.prisma.user.update({
          where: { id: user.id },
          data: { defaultWorkspaceId: workspaceId },
        }),
      ]);
    }

    try {
      const member = await this.prisma.projectMember.create({
        data: {
          projectId,
          userId: dto.userId,
          role: roleToSet,
        },
        select: {
          userId: true,
          role: true,
          user: { select: { id: true, email: true, name: true } },
        },
      });

      this.realtime.emitProjectEvent(projectId, 'member.added', {
        actorUserId: requesterId,
        userId: dto.userId,
        role: member.role,
      });

      await this.audit.log({
        action: 'PROJECT_MEMBER_ADD',
        actorUserId: requesterId,
        entityType: 'project_member',
        entityId: dto.userId,
        projectId,
        payload: { userId: dto.userId, role: member.role },
      });

      return member;
    } catch (e: unknown) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException('User already in project');
      }
      throw e;
    }
  }

  async updateMemberRole(
    requesterId: string,
    projectId: string,
    targetUserId: string,
    dto: UpdateMemberRoleDto,
  ) {
    const { workspaceId } =
      await this.workspaceAccess.getRequiredWorkspace(requesterId);
    const requesterRole = await this.requireRole(
      requesterId,
      workspaceId,
      projectId,
    );

    if (
      requesterRole !== ProjectRole.OWNER &&
      requesterRole !== ProjectRole.MANAGER
    ) {
      throw new ForbiddenException();
    }

    const project = await this.getProject(workspaceId, projectId);
    if (!project) throw new NotFoundException('Project not found');

    if (targetUserId === project.ownerId) throw new ForbiddenException();

    if (dto.role === ProjectRole.OWNER) throw new ForbiddenException();

    const target = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: targetUserId } },
      select: { role: true },
    });
    if (!target) throw new NotFoundException('Member not found');

    // Managers cannot re-shape access control; they can only preserve MEMBER
    // roles for collaborators they already supervise.
    if (requesterRole === ProjectRole.MANAGER) {
      if (target.role !== ProjectRole.MEMBER) throw new ForbiddenException();
      if (dto.role !== ProjectRole.MEMBER) throw new ForbiddenException();
    }

    const updated = await this.prisma.projectMember.update({
      where: { projectId_userId: { projectId, userId: targetUserId } },
      data: { role: dto.role },
      select: {
        userId: true,
        role: true,
        user: { select: { id: true, email: true, name: true } },
      },
    });

    this.realtime.emitProjectEvent(projectId, 'member.role_updated', {
      actorUserId: requesterId,
      userId: targetUserId,
      role: dto.role,
    });

    await this.audit.log({
      action: 'PROJECT_MEMBER_ROLE_UPDATE',
      actorUserId: requesterId,
      entityType: 'project_member',
      entityId: targetUserId,
      projectId,
      payload: { role: dto.role },
    });

    return updated;
  }

  async removeMember(
    requesterId: string,
    projectId: string,
    targetUserId: string,
  ) {
    const { workspaceId } =
      await this.workspaceAccess.getRequiredWorkspace(requesterId);
    const requesterRole = await this.requireRole(
      requesterId,
      workspaceId,
      projectId,
    );

    if (
      requesterRole !== ProjectRole.OWNER &&
      requesterRole !== ProjectRole.MANAGER
    ) {
      throw new ForbiddenException();
    }

    const project = await this.getProject(workspaceId, projectId);
    if (!project) throw new NotFoundException('Project not found');

    if (targetUserId === project.ownerId) throw new ForbiddenException();

    const target = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: targetUserId } },
      select: { role: true },
    });
    if (!target) throw new NotFoundException('Member not found');

    if (
      requesterRole === ProjectRole.MANAGER &&
      target.role !== ProjectRole.MEMBER
    ) {
      throw new ForbiddenException();
    }

    await this.prisma.projectMember.delete({
      where: { projectId_userId: { projectId, userId: targetUserId } },
    });

    this.realtime.emitProjectEvent(projectId, 'member.removed', {
      actorUserId: requesterId,
      userId: targetUserId,
    });

    await this.audit.log({
      action: 'PROJECT_MEMBER_REMOVE',
      actorUserId: requesterId,
      entityType: 'project_member',
      entityId: targetUserId,
      projectId,
    });

    return { ok: true };
  }

  async leave(userId: string, projectId: string) {
    const { workspaceId } = await this.workspaceAccess.getRequiredWorkspace(
      userId,
    );
    const project = await this.getProject(workspaceId, projectId);
    if (!project) throw new NotFoundException('Project not found');

    // Owners must transfer ownership explicitly; "leave" is reserved for
    // non-owner members so a project cannot become ownerless by accident.
    if (project.ownerId === userId) throw new ForbiddenException();

    const member = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
      select: { userId: true },
    });
    if (!member) throw new NotFoundException('Member not found');

    await this.prisma.projectMember.delete({
      where: { projectId_userId: { projectId, userId } },
    });

    this.realtime.emitProjectEvent(projectId, 'member.left', {
      userId,
    });

    await this.audit.log({
      action: 'PROJECT_MEMBER_LEAVE',
      actorUserId: userId,
      entityType: 'project_member',
      entityId: userId,
      projectId,
    });

    return { ok: true };
  }
}
