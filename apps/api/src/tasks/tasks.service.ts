import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTaskDto } from './create-task.dto';
import { UpdateTaskDto } from './update-task.dto';
@Injectable()
export class TasksService {
  constructor(private prisma: PrismaService) {}

  private async assertProjectOwned(projectId: string, userId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, ownerId: userId },
      select: { id: true },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }
  }

  async create(userId: string, projectId: string, dto: CreateTaskDto) {
    await this.assertProjectOwned(projectId, userId);

    return this.prisma.task.create({
      data: {
        title: dto.title,
        description: dto.description,
        status: dto.status,
        priority: dto.priority,
        order: dto.order,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        projectId,
      },
    });
  }

  async list(userId: string, projectId: string) {
    await this.assertProjectOwned(projectId, userId);

    return this.prisma.task.findMany({
      where: { projectId },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async update(
    userId: string,
    projectId: string,
    taskId: string,
    dto: UpdateTaskDto,
  ) {
    await this.assertProjectOwned(projectId, userId);

    const task = await this.prisma.task.findFirst({
      where: { id: taskId, projectId },
      select: { id: true },
    });
    if (!task) throw new NotFoundException('Task not found');

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
    await this.assertProjectOwned(projectId, userId);

    const task = await this.prisma.task.findFirst({
      where: { id: taskId, projectId },
      select: { id: true },
    });
    if (!task) throw new NotFoundException('Task not found');

    await this.prisma.task.delete({ where: { id: taskId } });
    return { ok: true };
  }
  async assign(
    projectId: string,
    taskId: string,
    assigneeId: string,
    userId: string,
  ) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, ownerId: userId },
      select: { id: true },
    });
    if (!project) throw new ForbiddenException();

    const task = await this.prisma.task.findFirst({
      where: { id: taskId, projectId },
      select: { id: true },
    });
    if (!task) throw new NotFoundException('Task not found');

    return this.prisma.task.update({
      where: { id: taskId },
      data: { assigneeId },
    });
  }

  async unassign(projectId: string, taskId: string, userId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, ownerId: userId },
      select: { id: true },
    });
    if (!project) throw new ForbiddenException();

    const task = await this.prisma.task.findFirst({
      where: { id: taskId, projectId },
      select: { id: true },
    });
    if (!task) throw new NotFoundException('Task not found');

    return this.prisma.task.update({
      where: { id: taskId },
      data: { assigneeId: null },
    });
  }
}
