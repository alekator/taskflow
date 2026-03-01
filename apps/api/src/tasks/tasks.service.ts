import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  PreconditionFailedException,
} from '@nestjs/common';
import { Prisma, ProjectRole } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { requireIfMatchVersion } from '../common/if-match';
import { toPaginatedResult } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { ListTasksQueryDto } from './dto/list-tasks-query.dto';
import { UpdateTaskDto } from './dto/update-task.dto';

@Injectable()
export class TasksService {
  constructor(
    private prisma: PrismaService,
    private realtime: RealtimeService,
    private audit: AuditService,
  ) {}

  private async getMyProjectRole(userId: string, projectId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, ownerId: true },
    });
    if (!project) throw new NotFoundException('Project not found');

    // Owners keep full access even if the membership row is missing, so task
    // permissions follow project ownership as the source of truth.
    if (project.ownerId === userId) return ProjectRole.OWNER;

    const member = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
      select: { role: true },
    });

    if (!member) throw new ForbiddenException();

    return member.role;
  }

  private async ensureAssignableProjectUser(
    projectId: string,
    assigneeId: string,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: assigneeId },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { ownerId: true },
    });
    if (!project) throw new NotFoundException('Project not found');

    if (project.ownerId === assigneeId) {
      return;
    }

    const member = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: assigneeId } },
      select: { userId: true },
    });
    if (!member) throw new ForbiddenException('Assignee is not in project');
  }

  private buildWorkspaceAccessWhere(userId: string, userRole: string) {
    // Workspace task views are cross-project, so access has to be expressed via
    // the related project rather than a direct task field.
    if (userRole === 'ADMIN') {
      return {};
    }

    return {
      project: {
        OR: [{ ownerId: userId }, { members: { some: { userId } } }],
      },
    };
  }

  private buildTaskWhere(query: ListTasksQueryDto): Prisma.TaskWhereInput {
    return {
      ...(query.status ? { status: query.status } : {}),
      ...(query.priority ? { priority: query.priority } : {}),
      ...(query.assigneeId ? { assigneeId: query.assigneeId } : {}),
      ...(query.projectId ? { projectId: query.projectId } : {}),
      ...(query.search
        ? {
            OR: [
              { title: { contains: query.search, mode: 'insensitive' } },
              {
                description: { contains: query.search, mode: 'insensitive' },
              },
            ],
          }
        : {}),
    };
  }

  private buildDefaultRoadmapData(taskId: string): Prisma.JsonObject {
    // Return a full document shape so the client can render a usable canvas
    // immediately, even before the first explicit roadmap save exists.
    return {
      version: 1,
      taskId,
      viewport: { x: 0, y: 0, zoom: 1 },
      elements: [],
    };
  }

  async listWorkspace(
    userId: string,
    userRole: string,
    query: ListTasksQueryDto,
  ) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where: Prisma.TaskWhereInput = {
      AND: [
        this.buildWorkspaceAccessWhere(userId, userRole),
        this.buildTaskWhere(query),
      ],
    };

    const orderBy: Prisma.TaskOrderByWithRelationInput[] = query.sortBy
      ? [{ [query.sortBy]: query.sortOrder ?? 'asc' }, { createdAt: 'asc' }]
      : [{ updatedAt: 'desc' }, { createdAt: 'desc' }];

    const [total, items] = await this.prisma.$transaction([
      this.prisma.task.count({ where }),
      this.prisma.task.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          project: {
            select: { id: true, name: true },
          },
          assignee: {
            select: { id: true, email: true, name: true },
          },
        },
      }),
    ]);

    return toPaginatedResult(items, page, limit, total);
  }

  async findWorkspaceTaskById(
    userId: string,
    userRole: string,
    taskId: string,
  ) {
    const task = await this.prisma.task.findFirst({
      where: {
        AND: [{ id: taskId }, this.buildWorkspaceAccessWhere(userId, userRole)],
      },
      include: {
        project: {
          select: { id: true, name: true },
        },
        assignee: {
          select: { id: true, email: true, name: true },
        },
      },
    });

    if (!task) throw new NotFoundException('Task not found');
    return task;
  }

  async getWorkspaceTaskRoadmap(
    userId: string,
    userRole: string,
    taskId: string,
  ) {
    await this.findWorkspaceTaskById(userId, userRole, taskId);

    const roadmap = await this.prisma.taskRoadmap.findUnique({
      where: { taskId },
      select: { data: true, updatedAt: true },
    });

    return {
      taskId,
      data: roadmap?.data ?? this.buildDefaultRoadmapData(taskId),
      updatedAt: roadmap?.updatedAt ?? null,
    };
  }

  async updateWorkspaceTaskRoadmap(
    userId: string,
    userRole: string,
    taskId: string,
    data: Prisma.InputJsonValue,
  ) {
    const task = await this.findWorkspaceTaskById(userId, userRole, taskId);

    const saved = await this.prisma.taskRoadmap.upsert({
      where: { taskId },
      create: { taskId, data },
      update: { data },
      select: { data: true, updatedAt: true },
    });

    await this.audit.log({
      action: 'TASK_ROADMAP_UPDATE',
      actorUserId: userId,
      entityType: 'task',
      entityId: taskId,
      projectId: task.projectId,
      payload: {
        roadmapUpdatedAt: saved.updatedAt.toISOString(),
      },
    });

    return {
      taskId,
      data: saved.data,
      updatedAt: saved.updatedAt,
    };
  }

  async create(userId: string, projectId: string, dto: CreateTaskDto) {
    const role = await this.getMyProjectRole(userId, projectId);
    // Members can only create work for themselves. Owners/managers may set an
    // assignee explicitly, but only after membership validation.
    const assigneeId =
      role === ProjectRole.MEMBER ? userId : (dto.assigneeId ?? undefined);

    if (role !== ProjectRole.MEMBER && assigneeId) {
      await this.ensureAssignableProjectUser(projectId, assigneeId);
    }

    const created = await this.prisma.task.create({
      data: {
        title: dto.title,
        description: dto.description,
        status: dto.status,
        priority: dto.priority,
        order: dto.order,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        projectId,
        assigneeId,
      },
    });

    this.realtime.emitTaskEvent(projectId, 'task.created', {
      actorUserId: userId,
      taskId: created.id,
      assigneeId: created.assigneeId,
      title: created.title,
    });

    await this.audit.log({
      action: 'TASK_CREATE',
      actorUserId: userId,
      entityType: 'task',
      entityId: created.id,
      projectId,
      payload: { title: created.title, assigneeId: created.assigneeId },
    });

    return created;
  }

  async list(userId: string, projectId: string, query: ListTasksQueryDto) {
    await this.getMyProjectRole(userId, projectId);

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where: Prisma.TaskWhereInput = {
      ...this.buildTaskWhere(query),
      projectId,
    };

    const orderBy: Prisma.TaskOrderByWithRelationInput[] = query.sortBy
      ? [{ [query.sortBy]: query.sortOrder ?? 'asc' }, { createdAt: 'asc' }]
      : [{ order: 'asc' }, { createdAt: 'asc' }];

    const [total, items] = await this.prisma.$transaction([
      this.prisma.task.count({ where }),
      this.prisma.task.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return toPaginatedResult(items, page, limit, total);
  }

  async update(
    userId: string,
    projectId: string,
    taskId: string,
    ifMatchHeader: string | undefined,
    dto: UpdateTaskDto,
  ) {
    const role = await this.getMyProjectRole(userId, projectId);

    const task = await this.prisma.task.findFirst({
      where: { id: taskId, projectId },
    });
    if (!task) throw new NotFoundException('Task not found');

    if (role === ProjectRole.MEMBER && task.assigneeId !== userId) {
      throw new ForbiddenException();
    }

    // Reject stale clients before the write and again in the write condition.
    // The double-check keeps UX errors clear while still being race-safe.
    const expectedVersion = requireIfMatchVersion(ifMatchHeader);
    if (task.version !== expectedVersion) {
      throw new PreconditionFailedException('Version mismatch');
    }

    const updatedResult = await this.prisma.task.updateMany({
      where: { id: taskId, version: expectedVersion },
      data: {
        title: dto.title,
        description: dto.description,
        status: dto.status,
        priority: dto.priority,
        order: dto.order,
        dueDate:
          dto.dueDate === null
            ? null
            : dto.dueDate
              ? new Date(dto.dueDate)
              : undefined,
        version: { increment: 1 },
      },
    });

    if (updatedResult.count !== 1) {
      throw new PreconditionFailedException('Version mismatch');
    }

    const updated = await this.prisma.task.findUnique({
      where: { id: taskId },
    });
    if (!updated) throw new NotFoundException('Task not found');

    this.realtime.emitTaskEvent(projectId, 'task.updated', {
      actorUserId: userId,
      taskId: updated.id,
      assigneeId: updated.assigneeId,
      title: updated.title,
      status: updated.status,
    });

    await this.audit.log({
      action: 'TASK_UPDATE',
      actorUserId: userId,
      entityType: 'task',
      entityId: updated.id,
      projectId,
      payload: { title: updated.title, status: updated.status },
    });

    return updated;
  }

  async remove(
    userId: string,
    projectId: string,
    taskId: string,
    ifMatchHeader?: string,
  ) {
    const role = await this.getMyProjectRole(userId, projectId);

    const task = await this.prisma.task.findFirst({
      where: { id: taskId, projectId },
    });
    if (!task) throw new NotFoundException('Task not found');

    if (role === ProjectRole.MEMBER && task.assigneeId !== userId) {
      throw new ForbiddenException();
    }

    const expectedVersion = requireIfMatchVersion(ifMatchHeader);
    if (task.version !== expectedVersion) {
      throw new PreconditionFailedException('Version mismatch');
    }

    const deleted = await this.prisma.task.deleteMany({
      where: { id: taskId, version: expectedVersion },
    });

    if (deleted.count !== 1) {
      throw new PreconditionFailedException('Version mismatch');
    }

    this.realtime.emitTaskEvent(projectId, 'task.deleted', {
      actorUserId: userId,
      taskId,
    });

    await this.audit.log({
      action: 'TASK_DELETE',
      actorUserId: userId,
      entityType: 'task',
      entityId: taskId,
      projectId,
    });

    return { ok: true };
  }

  async assign(
    userId: string,
    projectId: string,
    taskId: string,
    assigneeId: string,
  ) {
    const role = await this.getMyProjectRole(userId, projectId);

    if (role !== ProjectRole.OWNER && role !== ProjectRole.MANAGER) {
      throw new ForbiddenException();
    }

    const task = await this.prisma.task.findFirst({
      where: { id: taskId, projectId },
    });
    if (!task) throw new NotFoundException('Task not found');

    // Assignment is intentionally constrained to project participants so tasks
    // never point at users who cannot open the project.
    await this.ensureAssignableProjectUser(projectId, assigneeId);

    const updated = await this.prisma.task.update({
      where: { id: taskId },
      data: { assigneeId },
    });

    this.realtime.emitTaskEvent(projectId, 'task.assigned', {
      actorUserId: userId,
      taskId,
      assigneeId,
    });

    await this.audit.log({
      action: 'TASK_ASSIGN',
      actorUserId: userId,
      entityType: 'task',
      entityId: taskId,
      projectId,
      payload: { assigneeId },
    });

    return updated;
  }

  async unassign(userId: string, projectId: string, taskId: string) {
    const role = await this.getMyProjectRole(userId, projectId);

    if (role !== ProjectRole.OWNER && role !== ProjectRole.MANAGER) {
      throw new ForbiddenException();
    }

    const task = await this.prisma.task.findFirst({
      where: { id: taskId, projectId },
    });
    if (!task) throw new NotFoundException('Task not found');

    const updated = await this.prisma.task.update({
      where: { id: taskId },
      data: { assigneeId: null },
    });

    this.realtime.emitTaskEvent(projectId, 'task.unassigned', {
      actorUserId: userId,
      taskId,
    });

    await this.audit.log({
      action: 'TASK_UNASSIGN',
      actorUserId: userId,
      entityType: 'task',
      entityId: taskId,
      projectId,
    });

    return updated;
  }
}
