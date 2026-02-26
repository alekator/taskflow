import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ProjectRole } from '@prisma/client';
import { toPaginatedResult } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { ListTasksQueryDto } from './dto/list-tasks-query.dto';
import { UpdateTaskDto } from './dto/update-task.dto';

@Injectable()
export class TasksService {
  constructor(private prisma: PrismaService) {}

  private async getMyProjectRole(userId: string, projectId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, ownerId: true },
    });
    if (!project) throw new NotFoundException('Project not found');

    if (project.ownerId === userId) return ProjectRole.OWNER;

    const member = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
      select: { role: true },
    });

    if (!member) throw new ForbiddenException();

    return member.role;
  }

  async create(userId: string, projectId: string, dto: CreateTaskDto) {
    const role = await this.getMyProjectRole(userId, projectId);

    return this.prisma.task.create({
      data: {
        title: dto.title,
        description: dto.description,
        status: dto.status,
        priority: dto.priority,
        order: dto.order,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        projectId,

        assigneeId: role === ProjectRole.MEMBER ? userId : undefined,
      },
    });
  }

  async list(userId: string, projectId: string, query: ListTasksQueryDto) {
    await this.getMyProjectRole(userId, projectId);

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where: Prisma.TaskWhereInput = {
      projectId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.priority ? { priority: query.priority } : {}),
      ...(query.assigneeId ? { assigneeId: query.assigneeId } : {}),
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

    return this.prisma.task.update({
      where: { id: taskId },
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
      },
    });
  }

  async remove(userId: string, projectId: string, taskId: string) {
    const role = await this.getMyProjectRole(userId, projectId);

    const task = await this.prisma.task.findFirst({
      where: { id: taskId, projectId },
    });
    if (!task) throw new NotFoundException('Task not found');

    if (role === ProjectRole.MEMBER && task.assigneeId !== userId) {
      throw new ForbiddenException();
    }

    await this.prisma.task.delete({ where: { id: taskId } });
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

    if (project.ownerId !== assigneeId) {
      const member = await this.prisma.projectMember.findUnique({
        where: { projectId_userId: { projectId, userId: assigneeId } },
        select: { userId: true },
      });
      if (!member) throw new ForbiddenException('Assignee is not in project');
    }

    return this.prisma.task.update({
      where: { id: taskId },
      data: { assigneeId },
    });
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

    return this.prisma.task.update({
      where: { id: taskId },
      data: { assigneeId: null },
    });
  }
}
