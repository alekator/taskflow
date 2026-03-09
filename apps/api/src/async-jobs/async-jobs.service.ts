import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { AsyncJob, AsyncJobStatus, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';

type EnqueueJobInput = {
  type: string;
  payload: Prisma.InputJsonValue;
  runAt?: Date;
  maxAttempts?: number;
  dedupeKey?: string;
};

type RunDueJobsResult = {
  scanned: number;
  claimed: number;
  succeeded: number;
  failed: number;
  retried: number;
};

@Injectable()
export class AsyncJobsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AsyncJobsService.name);
  private timer: NodeJS.Timeout | null = null;
  private readonly workerId = `worker-${randomUUID()}`;
  private isRunning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  onModuleInit() {
    if ((process.env.NODE_ENV ?? 'development') === 'test') {
      return;
    }

    const pollInterval = Number.parseInt(
      process.env.JOBS_POLL_INTERVAL_MS ?? '4000',
      10,
    );
    const intervalMs =
      Number.isInteger(pollInterval) && pollInterval > 0 ? pollInterval : 4000;

    this.timer = setInterval(() => {
      void this.runDueJobsOnce().catch((error: unknown) => {
        this.logger.error(
          `Background jobs run failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      });
    }, intervalMs);
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async enqueue(input: EnqueueJobInput): Promise<AsyncJob> {
    if (input.dedupeKey) {
      const existing = await this.prisma.asyncJob.findUnique({
        where: { dedupeKey: input.dedupeKey },
      });
      if (existing) return existing;
    }

    try {
      return await this.prisma.asyncJob.create({
        data: {
          type: input.type,
          payload: input.payload,
          runAt: input.runAt ?? new Date(),
          maxAttempts: input.maxAttempts ?? 5,
          dedupeKey: input.dedupeKey,
        },
      });
    } catch (error: unknown) {
      if (
        input.dedupeKey &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existing = await this.prisma.asyncJob.findUnique({
          where: { dedupeKey: input.dedupeKey },
        });
        if (existing) return existing;
      }
      throw error;
    }
  }

  async runDueJobsOnce(batchSize?: number): Promise<RunDueJobsResult> {
    if (this.isRunning) {
      return { scanned: 0, claimed: 0, succeeded: 0, failed: 0, retried: 0 };
    }

    this.isRunning = true;
    try {
      const batchSizeFromEnv = Number.parseInt(
        process.env.JOBS_BATCH_SIZE ?? '20',
        10,
      );
      const limit =
        batchSize && batchSize > 0
          ? batchSize
          : Number.isInteger(batchSizeFromEnv) && batchSizeFromEnv > 0
            ? batchSizeFromEnv
            : 20;

      const now = new Date();
      const candidates = await this.prisma.asyncJob.findMany({
        where: {
          status: AsyncJobStatus.PENDING,
          runAt: { lte: now },
        },
        orderBy: [{ runAt: 'asc' }, { createdAt: 'asc' }],
        take: limit,
      });

      const result: RunDueJobsResult = {
        scanned: candidates.length,
        claimed: 0,
        succeeded: 0,
        failed: 0,
        retried: 0,
      };

      for (const candidate of candidates) {
        const claimed = await this.prisma.asyncJob.updateMany({
          where: {
            id: candidate.id,
            status: AsyncJobStatus.PENDING,
          },
          data: {
            status: AsyncJobStatus.PROCESSING,
            lockedAt: new Date(),
            lockedBy: this.workerId,
          },
        });

        if (claimed.count !== 1) continue;
        result.claimed += 1;

        try {
          await this.processJob(candidate);
          await this.prisma.asyncJob.update({
            where: { id: candidate.id },
            data: {
              status: AsyncJobStatus.SUCCEEDED,
              processedAt: new Date(),
              lockedAt: null,
              lockedBy: null,
              lastError: null,
            },
          });
          result.succeeded += 1;
        } catch (error: unknown) {
          const nextAttempts = candidate.attempts + 1;
          const reachedLimit = nextAttempts >= candidate.maxAttempts;
          const retryDelayMs = this.computeRetryDelayMs(nextAttempts);

          await this.prisma.asyncJob.update({
            where: { id: candidate.id },
            data: {
              attempts: nextAttempts,
              status: reachedLimit ? AsyncJobStatus.FAILED : AsyncJobStatus.PENDING,
              runAt: reachedLimit
                ? candidate.runAt
                : new Date(Date.now() + retryDelayMs),
              lastError:
                error instanceof Error
                  ? error.message.slice(0, 1000)
                  : String(error).slice(0, 1000),
              lockedAt: null,
              lockedBy: null,
            },
          });

          if (reachedLimit) {
            result.failed += 1;
          } else {
            result.retried += 1;
          }
        }
      }

      return result;
    } finally {
      this.isRunning = false;
    }
  }

  private computeRetryDelayMs(attempt: number) {
    const baseMs = 30_000;
    const maxMs = 15 * 60_000;
    return Math.min(maxMs, baseMs * Math.max(1, attempt));
  }

  private async processJob(job: AsyncJob) {
    if (job.type === 'SEND_WORKSPACE_INVITE_EMAIL') {
      await this.handleSendWorkspaceInviteEmail(job);
      return;
    }

    throw new Error(`Unknown async job type: ${job.type}`);
  }

  private async handleSendWorkspaceInviteEmail(job: AsyncJob) {
    const payload =
      job.payload && typeof job.payload === 'object' && !Array.isArray(job.payload)
        ? (job.payload as Record<string, unknown>)
        : null;

    const invitationId = payload?.invitationId;
    const email = payload?.email;
    const inviteLink = payload?.inviteLink;
    const requestedByUserId = payload?.requestedByUserId;

    if (
      typeof invitationId !== 'string' ||
      typeof email !== 'string' ||
      typeof inviteLink !== 'string'
    ) {
      throw new Error('Invalid SEND_WORKSPACE_INVITE_EMAIL payload');
    }

    if (payload?.forceFail === true) {
      throw new Error('Forced failure for retry flow');
    }

    // Placeholder dispatch: real provider integration can replace this handler
    // without changing enqueue contracts or retry semantics.
    await this.audit.log({
      action: 'WORKSPACE_INVITATION_EMAIL_DISPATCHED',
      actorUserId:
        typeof requestedByUserId === 'string' ? requestedByUserId : undefined,
      entityType: 'workspace_invitation',
      entityId: invitationId,
      payload: {
        email,
        inviteLink,
        delivery: 'simulated',
      },
    });
  }
}
