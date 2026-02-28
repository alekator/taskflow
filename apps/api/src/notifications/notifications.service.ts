import { Injectable } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { toPaginatedResult } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';
import { ListNotificationsQueryDto } from './dto/list-notifications-query.dto';

type AuditLogRow = {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  projectId: string | null;
  actorUserId: string | null;
  requestId: string | null;
  payload: Prisma.JsonValue;
  createdAt: Date;
};

type NotificationItem = {
  id: string;
  type: string;
  title: string;
  message: string;
  href: string;
  createdAt: Date;
  action: string;
  projectId: string | null;
  entityType: string | null;
  entityId: string | null;
  actorUserId: string | null;
  requestId: string | null;
  isOwnAction: boolean;
};

type RelatedProject = { id: string; name: string };
type RelatedTask = {
  id: string;
  title: string;
  project: { id: string; name: string };
};
type RelatedUser = { id: string; name: string | null; email: string };
type RelatedEntities = {
  projects: Map<string, RelatedProject>;
  tasks: Map<string, RelatedTask>;
  users: Map<string, RelatedUser>;
};

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    userId: string,
    userRole: string,
    query: ListNotificationsQueryDto,
  ) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const accessibleProjectIds = await this.getAccessibleProjectIds(userId, userRole);

    const where = this.buildWhere(userId, userRole, accessibleProjectIds);

    const [total, logs] = await this.prisma.$transaction([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          action: true,
          entityType: true,
          entityId: true,
          projectId: true,
          actorUserId: true,
          requestId: true,
          payload: true,
          createdAt: true,
        },
      }),
    ]);

    const related = await this.loadRelatedEntities(logs);
    const items = logs.map((log) =>
      this.toNotification(log, userId, related),
    );

    return toPaginatedResult(items, page, limit, total);
  }

  private async getAccessibleProjectIds(userId: string, userRole: string) {
    if (userRole === UserRole.ADMIN) {
      const projects = await this.prisma.project.findMany({
        select: { id: true },
      });
      return projects.map((project) => project.id);
    }

    const memberships = await this.prisma.project.findMany({
      where: {
        OR: [{ ownerId: userId }, { members: { some: { userId } } }],
      },
      select: { id: true },
    });

    return memberships.map((project) => project.id);
  }

  private buildWhere(
    userId: string,
    userRole: string,
    accessibleProjectIds: string[],
  ): Prisma.AuditLogWhereInput {
    const projectScope: Prisma.AuditLogWhereInput =
      userRole === UserRole.ADMIN
        ? { projectId: { not: null } }
        : accessibleProjectIds.length > 0
          ? { projectId: { in: accessibleProjectIds } }
          : { id: '__no_project_scope__' };

    return {
      action: {
        notIn: ['AUTH_REFRESH'],
      },
      OR: [
        projectScope,
        { actorUserId: userId },
        { entityType: 'user', entityId: userId },
      ],
    };
  }

  private async loadRelatedEntities(logs: AuditLogRow[]) {
    const projectIds = Array.from(
      new Set(logs.map((log) => log.projectId).filter(Boolean)),
    ) as string[];
    const taskIds = Array.from(
      new Set(
        logs
          .filter((log) => log.entityType === 'task' && log.entityId)
          .map((log) => log.entityId),
      ),
    ) as string[];
    const userIds = Array.from(
      new Set(
        logs.flatMap((log) => [
          log.actorUserId,
          log.entityType === 'user' || log.entityType === 'project_member'
            ? log.entityId
            : null,
        ]),
      ).values(),
    ).filter(Boolean) as string[];

    const [projects, tasks, users]: [RelatedProject[], RelatedTask[], RelatedUser[]] =
      await Promise.all([
      projectIds.length > 0
        ? this.prisma.project.findMany({
            where: { id: { in: projectIds } },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
      taskIds.length > 0
        ? this.prisma.task.findMany({
            where: { id: { in: taskIds } },
            select: {
              id: true,
              title: true,
              project: { select: { id: true, name: true } },
            },
          })
        : Promise.resolve([]),
      userIds.length > 0
        ? this.prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, name: true, email: true },
          })
        : Promise.resolve([]),
      ]);

    return {
      projects: new Map<string, RelatedProject>(
        projects.map(
          (project): [string, RelatedProject] => [project.id, project],
        ),
      ),
      tasks: new Map<string, RelatedTask>(
        tasks.map((task): [string, RelatedTask] => [task.id, task]),
      ),
      users: new Map<string, RelatedUser>(
        users.map((user): [string, RelatedUser] => [user.id, user]),
      ),
    };
  }

  private toNotification(
    log: AuditLogRow,
    currentUserId: string,
    related: RelatedEntities,
  ): NotificationItem {
    const actor = this.userLabel(log.actorUserId, related.users);
    const project = log.projectId ? related.projects.get(log.projectId) : null;
    const task = log.entityType === 'task' && log.entityId
      ? related.tasks.get(log.entityId)
      : null;
    const subjectUser =
      (log.entityType === 'user' || log.entityType === 'project_member') &&
      log.entityId
        ? related.users.get(log.entityId)
        : null;
    const payload = this.payloadObject(log.payload);

    const content = this.describeLog({
      action: log.action,
      actor,
      projectName: task?.project.name ?? project?.name ?? null,
      taskTitle:
        task?.title ??
        this.readPayloadString(payload, 'title') ??
        this.readPayloadString(payload, 'taskTitle'),
      subjectUser:
        subjectUser?.name || subjectUser?.email || (log.entityId ? this.short(log.entityId) : null),
      status: this.readPayloadString(payload, 'status'),
    });

    return {
      id: log.id,
      type: this.typeForAction(log.action),
      title: content.title,
      message: content.message,
      href: this.hrefForLog(log),
      createdAt: log.createdAt,
      action: log.action,
      projectId: log.projectId,
      entityType: log.entityType,
      entityId: log.entityId,
      actorUserId: log.actorUserId,
      requestId: log.requestId,
      isOwnAction: log.actorUserId === currentUserId,
    };
  }

  private describeLog(input: {
    action: string;
    actor: string;
    projectName: string | null;
    taskTitle: string | null;
    subjectUser: string | null;
    status: string | null;
  }) {
    const projectRef = input.projectName ? `"${input.projectName}"` : 'a project';
    const taskRef = input.taskTitle ? `"${input.taskTitle}"` : 'a task';
    const userRef = input.subjectUser ? `"${input.subjectUser}"` : 'a teammate';

    switch (input.action) {
      case 'TASK_CREATE':
        return {
          title: 'Task created',
          message: `${input.actor} created ${taskRef} in ${projectRef}.`,
        };
      case 'TASK_UPDATE':
        return {
          title: 'Task updated',
          message: `${input.actor} updated ${taskRef}${input.status ? ` and set status to ${input.status}.` : '.'}`,
        };
      case 'TASK_DELETE':
        return {
          title: 'Task deleted',
          message: `${input.actor} removed ${taskRef} from ${projectRef}.`,
        };
      case 'TASK_ASSIGN':
        return {
          title: 'Task assigned',
          message: `${input.actor} assigned ${taskRef}.`,
        };
      case 'TASK_UNASSIGN':
        return {
          title: 'Task unassigned',
          message: `${input.actor} unassigned ${taskRef}.`,
        };
      case 'TASK_ROADMAP_UPDATE':
        return {
          title: 'Road map updated',
          message: `${input.actor} updated the road map for ${taskRef}.`,
        };
      case 'PROJECT_CREATE':
        return {
          title: 'Project created',
          message: `${input.actor} created ${projectRef}.`,
        };
      case 'PROJECT_UPDATE':
        return {
          title: 'Project updated',
          message: `${input.actor} updated ${projectRef}.`,
        };
      case 'PROJECT_DELETE':
        return {
          title: 'Project deleted',
          message: `${input.actor} removed ${projectRef}.`,
        };
      case 'PROJECT_MEMBER_ADD':
        return {
          title: 'Member added',
          message: `${input.actor} added ${userRef} to ${projectRef}.`,
        };
      case 'PROJECT_MEMBER_REMOVE':
        return {
          title: 'Member removed',
          message: `${input.actor} removed ${userRef} from ${projectRef}.`,
        };
      case 'PROJECT_MEMBER_ROLE_UPDATE':
        return {
          title: 'Member role updated',
          message: `${input.actor} changed access for ${userRef} in ${projectRef}.`,
        };
      case 'PROJECT_MEMBER_LEAVE':
        return {
          title: 'Member left project',
          message: `${userRef} left ${projectRef}.`,
        };
      case 'AUTH_LOGIN':
        return {
          title: 'Account sign-in',
          message: `${input.actor} signed in to TaskFlow.`,
        };
      case 'AUTH_REGISTER':
        return {
          title: 'Account created',
          message: `${input.actor} registered a TaskFlow account.`,
        };
      case 'AUTH_LOGOUT':
        return {
          title: 'Account sign-out',
          message: `${input.actor} signed out from TaskFlow.`,
        };
      default:
        return {
          title: input.action.replaceAll('_', ' '),
          message: `${input.actor} triggered ${input.action.replaceAll('_', ' ').toLowerCase()}.`,
        };
    }
  }

  private hrefForLog(log: AuditLogRow) {
    if (log.entityType === 'task' && log.entityId) {
      return `/app/tasks/${log.entityId}`;
    }

    if (log.projectId) {
      return `/app/projects/${log.projectId}`;
    }

    if (log.entityType === 'user' || log.action.startsWith('AUTH_')) {
      return '/app/users';
    }

    return '/app';
  }

  private typeForAction(action: string) {
    if (action.startsWith('TASK_')) return 'task';
    if (action.startsWith('PROJECT_')) return 'project';
    if (action.startsWith('AUTH_')) return 'security';
    return 'workspace';
  }

  private payloadObject(value: Prisma.JsonValue) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    return value as Record<string, Prisma.JsonValue>;
  }

  private readPayloadString(
    payload: Record<string, Prisma.JsonValue> | null,
    key: string,
  ) {
    const value = payload?.[key];
    return typeof value === 'string' ? value : null;
  }

  private userLabel(
    userId: string | null,
    users: Map<string, RelatedUser>,
  ) {
    if (!userId) return 'Someone';
    const user = users.get(userId);
    if (!user) return this.short(userId);
    return user.name || user.email;
  }

  private short(value: string) {
    return value.length > 16 ? `${value.slice(0, 8)}...${value.slice(-4)}` : value;
  }
}
