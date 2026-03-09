import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TaskStatus, UserRole } from '@prisma/client';
import { toPaginatedResult } from '../common/pagination';
import { WorkspaceAccessService } from '../common/workspace-access.service';
import { PrismaService } from '../prisma/prisma.service';
import { ListUsersQueryDto } from './dto/list-users-query.dto';

type WorkspaceUserItem = {
  id: string;
  email: string;
  role: UserRole;
  name: string | null;
  createdAt: Date;
  projectCount: number;
  activeTasksCount: number;
  completedTasksCount: number;
  totalTasksCount: number;
  projects: Array<{
    id: string;
    name: string;
    role: string;
  }>;
};

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private workspaceAccess: WorkspaceAccessService,
  ) {}

  async list(requesterId: string, query: ListUsersQueryDto) {
    const { workspaceId } =
      await this.workspaceAccess.getRequiredWorkspace(requesterId);

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where: Prisma.UserWhereInput = {
      workspaceMembers: {
        some: {
          workspaceId,
        },
      },
      ...(query.role ? { role: query.role } : {}),
      ...(query.search
        ? {
            OR: [
              { email: { contains: query.search, mode: 'insensitive' } },
              { name: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const orderBy: Prisma.UserOrderByWithRelationInput = {
      [query.sortBy ?? 'createdAt']: query.sortOrder ?? 'desc',
    };

    const [total, users] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          email: true,
          role: true,
          name: true,
          createdAt: true,
          projectMembers: {
            where: {
              project: {
                workspaceId,
              },
            },
            select: {
              role: true,
              project: { select: { id: true, name: true } },
            },
            orderBy: { createdAt: 'desc' },
          },
        },
      }),
    ]);

    const userIds = users.map((user) => user.id);

    // Compute workload aggregates in batch to avoid N+1 counting queries for
    // each user row in the workspace directory.
    const [activeTaskCounts, completedTaskCounts, totalTaskCounts] =
      await Promise.all([
        this.prisma.task.groupBy({
          by: ['assigneeId'],
          where: {
            assigneeId: { in: userIds },
            project: {
              workspaceId,
            },
            status: {
              in: [TaskStatus.TODO, TaskStatus.IN_PROGRESS, TaskStatus.TESTING],
            },
          },
          _count: { _all: true },
        }),
        this.prisma.task.groupBy({
          by: ['assigneeId'],
          where: {
            assigneeId: { in: userIds },
            project: {
              workspaceId,
            },
            status: TaskStatus.DONE,
          },
          _count: { _all: true },
        }),
        this.prisma.task.groupBy({
          by: ['assigneeId'],
          where: {
            assigneeId: { in: userIds },
            project: {
              workspaceId,
            },
          },
          _count: { _all: true },
        }),
      ]);

    const activeMap = new Map(
      activeTaskCounts.map((row) => [row.assigneeId, row._count._all]),
    );
    const completedMap = new Map(
      completedTaskCounts.map((row) => [row.assigneeId, row._count._all]),
    );
    const totalMap = new Map(
      totalTaskCounts.map((row) => [row.assigneeId, row._count._all]),
    );

    // Merge relational data and aggregated counters into a flat DTO so the UI
    // can render the directory without additional follow-up requests.
    const items: WorkspaceUserItem[] = users.map((user) => ({
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      createdAt: user.createdAt,
      projectCount: user.projectMembers.length,
      activeTasksCount: activeMap.get(user.id) ?? 0,
      completedTasksCount: completedMap.get(user.id) ?? 0,
      totalTasksCount: totalMap.get(user.id) ?? 0,
      projects: user.projectMembers.map((member) => ({
        id: member.project.id,
        name: member.project.name,
        role: member.role,
      })),
    }));

    return toPaginatedResult(items, page, limit, total);
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
        name: true,
        createdAt: true,
      },
    });

    if (!user) throw new NotFoundException('User not found');

    return user;
  }
}
