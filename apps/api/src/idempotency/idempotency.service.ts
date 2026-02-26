import { ConflictException, Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { IdempotencyStatus, Prisma } from '@prisma/client';
import { stableJsonStringify } from '../common/stable-json';
import { PrismaService } from '../prisma/prisma.service';

type BeginInput = {
  actorUserId: string;
  method: string;
  path: string;
  key: string;
  body: unknown;
  params: unknown;
  query: unknown;
};

export type BeginResult =
  | { type: 'started'; recordId: string }
  | {
      type: 'replay';
      statusCode: number | null;
      responseBody: Prisma.JsonValue | null;
    }
  | { type: 'in_progress' };

@Injectable()
export class IdempotencyService {
  constructor(private readonly prisma: PrismaService) {}

  async begin(input: BeginInput): Promise<BeginResult> {
    const requestHash = this.hashRequest(input.body, input.params, input.query);

    try {
      const created = await this.prisma.idempotencyRecord.create({
        data: {
          actorUserId: input.actorUserId,
          method: input.method,
          path: input.path,
          key: input.key,
          requestHash,
          status: IdempotencyStatus.IN_PROGRESS,
        },
        select: { id: true },
      });

      return { type: 'started', recordId: created.id };
    } catch (error: unknown) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== 'P2002'
      ) {
        throw error;
      }
    }

    const existing = await this.prisma.idempotencyRecord.findUnique({
      where: {
        actorUserId_method_path_key: {
          actorUserId: input.actorUserId,
          method: input.method,
          path: input.path,
          key: input.key,
        },
      },
    });

    if (!existing) {
      return { type: 'in_progress' };
    }

    if (existing.requestHash !== requestHash) {
      throw new ConflictException(
        'Idempotency-Key cannot be reused with a different payload',
      );
    }

    if (existing.status === IdempotencyStatus.COMPLETED) {
      return {
        type: 'replay',
        statusCode: existing.statusCode,
        responseBody: existing.responseBody,
      };
    }

    return { type: 'in_progress' };
  }

  async complete(
    recordId: string,
    statusCode: number,
    responseBody: unknown,
  ): Promise<void> {
    await this.prisma.idempotencyRecord.update({
      where: { id: recordId },
      data: {
        status: IdempotencyStatus.COMPLETED,
        statusCode,
        responseBody:
          responseBody === null
            ? Prisma.JsonNull
            : this.toInputJsonValue(responseBody),
      },
    });
  }

  async fail(recordId: string): Promise<void> {
    await this.prisma.idempotencyRecord.delete({
      where: { id: recordId },
    });
  }

  private hashRequest(body: unknown, params: unknown, query: unknown): string {
    const raw = stableJsonStringify({
      body: body ?? null,
      params: params ?? null,
      query: query ?? null,
    });

    return createHash('sha256').update(raw).digest('hex');
  }

  private toInputJsonValue(value: unknown): Prisma.InputJsonValue {
    const raw = stableJsonStringify(value ?? null);
    return JSON.parse(raw) as Prisma.InputJsonValue;
  }
}
