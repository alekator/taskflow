import { ForbiddenException, Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { Prisma, UserRole } from '@prisma/client';
import { toPaginatedResult } from '../common/pagination';
import { RequestContextService } from '../common/request-context.service';
import { stableJsonStringify } from '../common/stable-json';
import { PrismaService } from '../prisma/prisma.service';
import { ListAuditLogsQueryDto } from './dto/list-audit-logs-query.dto';

export type AuditLogInput = {
  action: string;
  actorUserId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  projectId?: string | null;
  payload?: Prisma.InputJsonValue | null;
};

@Injectable()
export class AuditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly requestContext: RequestContextService,
  ) {}

  async log(input: AuditLogInput) {
    const ctx = this.requestContext.get();
    const createdAt = new Date();

    try {
      await this.prisma.$transaction(async (tx) => {
        const previous = await tx.auditLog.findFirst({
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          select: { hash: true },
        });

        const payload = input.payload ?? undefined;
        const prevHash = previous?.hash ?? null;
        const hash = this.computeHash({
          createdAt,
          action: input.action,
          actorUserId: input.actorUserId ?? null,
          entityType: input.entityType ?? null,
          entityId: input.entityId ?? null,
          projectId: input.projectId ?? null,
          requestId: ctx?.requestId ?? null,
          ip: ctx?.ip ?? null,
          userAgent: ctx?.userAgent ?? null,
          prevHash,
          payload,
        });

        await tx.auditLog.create({
          data: {
            createdAt,
            action: input.action,
            actorUserId: input.actorUserId ?? null,
            entityType: input.entityType ?? null,
            entityId: input.entityId ?? null,
            projectId: input.projectId ?? null,
            requestId: ctx?.requestId ?? null,
            ip: ctx?.ip ?? null,
            userAgent: ctx?.userAgent ?? null,
            prevHash,
            hash,
            payload,
          },
        });
      });
    } catch {
      // Audit logging should never break user-facing flows.
    }
  }

  async list(requesterId: string, query: ListAuditLogsQueryDto) {
    const requester = await this.prisma.user.findUnique({
      where: { id: requesterId },
      select: { role: true },
    });

    let scopedProjectIds: string[] | null = null;

    if (requester?.role === UserRole.ADMIN) {
      scopedProjectIds = null;
    } else if (requester?.role === UserRole.MANAGER) {
      const managedProjects = await this.prisma.project.findMany({
        where: {
          OR: [
            { ownerId: requesterId },
            {
              members: {
                some: {
                  userId: requesterId,
                  role: 'MANAGER',
                },
              },
            },
          ],
        },
        select: { id: true },
      });

      scopedProjectIds = managedProjects.map((project) => project.id);
    } else {
      throw new ForbiddenException('Only ADMIN or MANAGER can read audit logs');
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const projectIdQuery = query.projectId;

    const where: Prisma.AuditLogWhereInput = {
      ...(scopedProjectIds
        ? {
            projectId: {
              in: projectIdQuery
                ? scopedProjectIds.filter(
                    (projectId) => projectId.includes(projectIdQuery),
                  )
                : scopedProjectIds,
            },
          }
        : projectIdQuery
          ? { projectId: this.contains(projectIdQuery) }
          : {}),
      ...(query.action ? { action: this.contains(query.action) } : {}),
      ...(query.entityType
        ? { entityType: this.contains(query.entityType) }
        : {}),
      ...(query.entityId ? { entityId: this.contains(query.entityId) } : {}),
      ...(query.actorUserId
        ? { actorUserId: this.contains(query.actorUserId) }
        : {}),
      ...(query.requestId ? { requestId: this.contains(query.requestId) } : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: query.from } : {}),
              ...(query.to ? { lte: query.to } : {}),
            },
          }
        : {}),
    };

    const [total, items] = await this.prisma.$transaction([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return toPaginatedResult(items, page, limit, total);
  }

  private contains(value: string): Prisma.StringFilter {
    return {
      contains: value,
      mode: 'insensitive',
    };
  }

  private computeHash(input: {
    createdAt: Date;
    action: string;
    actorUserId: string | null;
    entityType: string | null;
    entityId: string | null;
    projectId: string | null;
    requestId: string | null;
    ip: string | null;
    userAgent: string | null;
    prevHash: string | null;
    payload?: Prisma.InputJsonValue;
  }): string {
    const canonical = stableJsonStringify({
      createdAt: input.createdAt.toISOString(),
      action: input.action,
      actorUserId: input.actorUserId,
      entityType: input.entityType,
      entityId: input.entityId,
      projectId: input.projectId,
      requestId: input.requestId,
      ip: input.ip,
      userAgent: input.userAgent,
      prevHash: input.prevHash,
      payload: input.payload ?? null,
    });

    return createHash('sha256').update(canonical).digest('hex');
  }
}
