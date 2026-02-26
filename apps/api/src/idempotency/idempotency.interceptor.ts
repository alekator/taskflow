import {
  BadRequestException,
  CallHandler,
  ConflictException,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { from, Observable, of, throwError } from 'rxjs';
import { catchError, map, mergeMap, switchMap } from 'rxjs/operators';
import { RequestUser } from '../auth/request-user.type';
import { IdempotencyService } from './idempotency.service';

type RequestWithUser = Request & { user?: RequestUser };

const IDEMPOTENT_METHODS = new Set(['POST', 'PATCH', 'DELETE']);

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private readonly idempotency: IdempotencyService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const http = context.switchToHttp();
    const req = http.getRequest<RequestWithUser>();
    const res = http.getResponse<Response>();
    const method = req.method.toUpperCase();

    if (!IDEMPOTENT_METHODS.has(method)) {
      return next.handle();
    }

    const actorUserId = req.user?.id;
    if (!actorUserId) {
      return next.handle();
    }

    const rawKey = req.header('idempotency-key');
    if (!rawKey) {
      return next.handle();
    }

    const key = rawKey.trim();
    if (!key) {
      throw new BadRequestException('Idempotency-Key header cannot be empty');
    }

    const path = req.originalUrl.split('?')[0] ?? req.path;

    return from(
      this.idempotency.begin({
        actorUserId,
        method,
        path,
        key,
        body: req.body,
        params: req.params,
        query: req.query,
      }),
    ).pipe(
      switchMap((beginResult) => {
        if (beginResult.type === 'replay') {
          res.status(beginResult.statusCode ?? 200);
          return of(beginResult.responseBody);
        }

        if (beginResult.type === 'in_progress') {
          return throwError(
            () =>
              new ConflictException(
                'Request with this Idempotency-Key is in progress',
              ),
          );
        }

        return next.handle().pipe(
          mergeMap((responseBody: unknown) =>
            from(
              this.idempotency.complete(
                beginResult.recordId,
                res.statusCode,
                responseBody,
              ),
            ).pipe(map(() => responseBody)),
          ),
          catchError((error: unknown) =>
            from(this.idempotency.fail(beginResult.recordId)).pipe(
              mergeMap(() => throwError(() => error)),
            ),
          ),
        );
      }),
    );
  }
}
