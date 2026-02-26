import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { toPaginatedResult } from '../common/pagination';
import { RequestContextService } from '../common/request-context.service';
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

    try {
      await this.prisma.auditLog.create({
        data: {
          action: input.action,
          actorUserId: input.actorUserId ?? null,
          entityType: input.entityType ?? null,
          entityId: input.entityId ?? null,
          projectId: input.projectId ?? null,
          requestId: ctx?.requestId ?? null,
          ip: ctx?.ip ?? null,
          userAgent: ctx?.userAgent ?? null,
          payload: input.payload ?? undefined,
        },
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
    if (requester?.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Only ADMIN can read audit logs');
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where: Prisma.AuditLogWhereInput = {
      ...(query.action ? { action: query.action } : {}),
      ...(query.entityType ? { entityType: query.entityType } : {}),
      ...(query.entityId ? { entityId: query.entityId } : {}),
      ...(query.actorUserId ? { actorUserId: query.actorUserId } : {}),
      ...(query.requestId ? { requestId: query.requestId } : {}),
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
}
